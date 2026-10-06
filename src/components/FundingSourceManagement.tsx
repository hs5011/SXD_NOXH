import React from 'react';
import ListManagement from './ListManagement';

export default function FundingSourceManagement({ fundingSources, setFundingSources }: { fundingSources: string[], setFundingSources: (sources: string[]) => void }) {
  return <ListManagement items={fundingSources} setItems={setFundingSources} title="Nguồn vốn" />;
}
