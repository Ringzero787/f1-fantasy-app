import React, { Suspense } from 'react';
import { Loading } from '../../../src/components';

const BroadcastContent = React.lazy(() => import('../../../src/admin/BroadcastContent'));

export default function BroadcastScreen() {
  return (
    <Suspense fallback={<Loading fullScreen message="Loading broadcast..." />}>
      <BroadcastContent />
    </Suspense>
  );
}
