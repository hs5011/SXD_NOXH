/**
 * Secure SHA-256 hashing utility compatible with both Node.js and Browser runtimes.
 * Implements a synchronous pure-TypeScript/JS SHA-256 algorithm to avoid async overhead.
 */
export function hashPassword(password: string): string {
  if (!password) return '';
  
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  let result = '';

  const words: number[] = [];
  const asciiLength = password[lengthProperty] * 8;
  
  const hash = (hashPassword as any).h = (hashPassword as any).h || [];
  const k = (hashPassword as any).k = (hashPassword as any).k || [];
  let primeCounter = k[lengthProperty];

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = 1;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  
  const wordsLength = ((asciiLength + 64) >>> 9 << 4) + 15;
  for (let i = 0; i < wordsLength; i++) words[i] = 0;
  
  for (i = 0; i < password[lengthProperty]; i++) {
    words[i >>> 2] |= password.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  words[asciiLength >>> 5] |= 0x80 << (24 - (asciiLength % 32));
  words[wordsLength] = asciiLength;
  
  let h0 = hash[0], h1 = hash[1], h2 = hash[2], h3 = hash[3], h4 = hash[4], h5 = hash[5], h6 = hash[6], h7 = hash[7];
  
  for (i = 0; i < wordsLength; i += 16) {
    const w = [];
    for (j = 0; j < 16; j++) w[j] = words[i + j];
    for (j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (j = 0; j < 64; j++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  
  const hashVals = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (i = 0; i < 8; i++) {
    const v = hashVals[i];
    result += ((v >>> 24) & 0xff).toString(16).padStart(2, '0') +
              ((v >>> 16) & 0xff).toString(16).padStart(2, '0') +
              ((v >>> 8) & 0xff).toString(16).padStart(2, '0') +
              (v & 0xff).toString(16).padStart(2, '0');
  }
  return result;
}

export function generatePolicyCompliantPassword(policy: {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
}): string {
  const minLength = policy.minLength || 6;
  const uppercaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercaseChars = "abcdefghijklmnopqrstuvwxyz";
  const numberChars = "0123456789";
  const specialChars = "!@#$%&*";

  let mandatoryPool: string[] = [];
  let fullPool = "";

  if (policy.requireUppercase) {
    const char = uppercaseChars[Math.floor(Math.random() * uppercaseChars.length)];
    mandatoryPool.push(char);
    fullPool += uppercaseChars;
  }
  if (policy.requireLowercase) {
    const char = lowercaseChars[Math.floor(Math.random() * lowercaseChars.length)];
    mandatoryPool.push(char);
    fullPool += lowercaseChars;
  }
  if (policy.requireNumbers) {
    const char = numberChars[Math.floor(Math.random() * numberChars.length)];
    mandatoryPool.push(char);
    fullPool += numberChars;
  }
  if (policy.requireSpecialChars) {
    const char = specialChars[Math.floor(Math.random() * specialChars.length)];
    mandatoryPool.push(char);
    fullPool += specialChars;
  }

  // If no requirements are turned on, default to lowercase + uppercase + number pools
  if (fullPool === "") {
    fullPool = uppercaseChars + lowercaseChars + numberChars;
    mandatoryPool.push(lowercaseChars[Math.floor(Math.random() * lowercaseChars.length)]);
    mandatoryPool.push(uppercaseChars[Math.floor(Math.random() * uppercaseChars.length)]);
    mandatoryPool.push(numberChars[Math.floor(Math.random() * numberChars.length)]);
  }

  // Fill up the rest of the password length with random characters from the full pool
  const remainingLength = Math.max(0, minLength - mandatoryPool.length);
  for (let i = 0; i < remainingLength; i++) {
    const char = fullPool[Math.floor(Math.random() * fullPool.length)];
    mandatoryPool.push(char);
  }

  // Shuffle the mandatoryPool using Fisher-Yates shuffle
  for (let i = mandatoryPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = mandatoryPool[i];
    mandatoryPool[i] = mandatoryPool[j];
    mandatoryPool[j] = temp;
  }

  return mandatoryPool.join("");
}

