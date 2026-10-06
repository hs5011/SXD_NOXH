export function getApiBaseUrl(): string {
  // If explicitly configured in environment
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  }

  // If running in Capacitor/Cordova or non-HTTP protocols
  if (typeof window !== 'undefined') {
    const isCapacitor = 
      window.location.protocol === 'capacitor:' || 
      window.location.protocol === 'ionic:' || 
      window.location.protocol === 'file:' ||
      Boolean((window as any).Capacitor);

    if (isCapacitor) {
      const stored = localStorage.getItem('server_api_url');
      if (stored) return stored.replace(/\/$/, '');
      // In development or when previewed
      return window.location.origin.includes('localhost') 
        ? 'http://localhost:3000' 
        : window.location.origin;
    }
  }

  return '';
}

export function getFileUrl(pathOrFilename: string): string {
  if (!pathOrFilename) return '';
  if (
    pathOrFilename.startsWith('http://') || 
    pathOrFilename.startsWith('https://') || 
    pathOrFilename.startsWith('blob:') || 
    pathOrFilename.startsWith('data:')
  ) {
    return pathOrFilename;
  }

  const cleanPath = pathOrFilename.startsWith('/') 
    ? pathOrFilename 
    : `/uploads/${encodeURIComponent(pathOrFilename)}`;

  // Never put the JWT in a URL (leaks via history, logs, Referer); the server only accepts the Authorization header
  const baseUrl = getApiBaseUrl();

  if (baseUrl) {
    return `${baseUrl}${cleanPath}`;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${cleanPath}`;
  }

  return cleanPath;
}

// File name from a Content-Disposition header (RFC 5987 filename* first, then plain filename)
function fileNameFromDisposition(header: string | null): string {
  if (!header) return '';
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star) {
    try { return decodeURIComponent(star[1].trim()); } catch { /* fall through */ }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : '';
}

// Downloads a stored attachment through the signed-in API. The URL only carries the numeric id:
// putting the (Vietnamese) file name in the URL made IIS / HTTP.sys answer "400 Invalid URL".
export async function downloadAttachment(id: string | number, name?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/api/attachments/${encodeURIComponent(String(id))}/download`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as any));
      return { ok: false, error: data?.error || `Không tải được tệp (mã lỗi ${res.status}).` };
    }
    const blob = await res.blob();
    const fileName = fileNameFromDisposition(res.headers.get('content-disposition')) || name || `tep-dinh-kem-${id}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Không kết nối được máy chủ để tải tệp. Vui lòng thử lại.' };
  }
}

// Saved attachments have a numeric id; anything else is a local file not uploaded yet
export const isStoredAttachmentId = (id: any): boolean => id !== undefined && id !== null && /^\d+$/.test(String(id));

export function openFileOrDownload(file: any): void {
  if (!file) return;

  if (isStoredAttachmentId(file.id)) {
    downloadAttachment(file.id, file.name).then(r => { if (!r.ok) alert(r.error); });
    return;
  }

  if (file instanceof File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  let finalUrl = '';
  if (file.url) {
    finalUrl = getFileUrl(file.url);
  } else if (file.id && file.name) {
    finalUrl = getFileUrl(`attachment_${file.id}_${file.name}`);
  } else if (file.filename) {
    finalUrl = getFileUrl(file.filename);
  } else if (file.name) {
    finalUrl = getFileUrl(file.name);
  }

  if (finalUrl) {
    const a = document.createElement('a');
    a.href = finalUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (file.name) {
      a.download = file.name;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export async function apiFetch(input: string | Request, init?: RequestInit): Promise<Response> {
  let targetUrl: string = typeof input === 'string' ? input : input.url;
  const baseUrl = getApiBaseUrl();

  // If path is relative and baseUrl is needed (e.g. Capacitor)
  if (targetUrl.startsWith('/') && baseUrl) {
    targetUrl = `${baseUrl}${targetUrl}`;
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const newInit: RequestInit = { ...init };

  if (token) {
    const headers = new Headers(newInit.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    newInit.headers = headers;
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, newInit);
  } catch (err) {
    throw err;
  }

  // Handle Token Expiry (401 or 403 when token was supplied)
  if (response.status === 401 || (response.status === 403 && token)) {
    try {
      const clone = response.clone();
      const errorData = await clone.json().catch(() => null);
      const msg = errorData?.error || '';
      // The server marks session problems with a code; a wrong password at /api/login (also 401)
      // or a permission 403 must NOT log the user out. Keywords are kept for older servers.
      const code = errorData?.code || '';
      const isAuthIssue =
        code === 'AUTH_REQUIRED' ||
        code === 'TOKEN_INVALID' ||
        (!code && token !== null && (
          msg.toLowerCase().includes('token') ||
          msg.toLowerCase().includes('expired')
        ));

      if (isAuthIssue) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('current_user');
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:expired', { 
            detail: { message: msg || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' } 
          }));
        }
      }
    } catch (_) {
      // ignore parsing error
    }
  }

  return response;
}

export type UploadResult = { ok: boolean; doc?: any; error?: string };

// Upload one attachment and report the server's verdict (wrong type/size is rejected with 400)
export async function uploadProjectFile(projectId: string, file: File): Promise<UploadResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch(`/api/projects/${projectId}/attachments/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || `Lỗi máy chủ (${res.status})` };
    }
    return { ok: true, doc: data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Không kết nối được máy chủ' };
  }
}

export function describeUploadFailures(failures: { name: string; error: string }[]): string {
  return `Không tải lên được ${failures.length} tệp:\n` + failures.map(f => `• ${f.name}: ${f.error}`).join('\n');
}
