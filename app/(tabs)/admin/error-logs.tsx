import React, { Suspense } from 'react';
import { Loading } from '../../../src/components';

const ErrorLogsContent = React.lazy(() => import('../../../src/admin/ErrorLogsContent'));

export default function ErrorLogsScreen() {
  return (
    <Suspense fallback={<Loading fullScreen message="Loading error logs..." />}>
      <ErrorLogsContent />
    </Suspense>
  );
}
