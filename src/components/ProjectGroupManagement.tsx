import React from 'react';
import ListManagement from './ListManagement';

export default function ProjectGroupManagement({ projectGroups, setProjectGroups }: { projectGroups: string[], setProjectGroups: (groups: string[]) => void }) {
  return <ListManagement items={projectGroups} setItems={setProjectGroups} title="Nhóm dự án" />;
}
