import React, { Suspense } from 'react';
import { Loading } from '../../../src/components';

const AdminContent = React.lazy(() => import('../../../src/admin/AdminContent'));

export default function AdminScreen() {
  return (
    <Suspense fallback={<Loading fullScreen message="Loading admin..." />}>
      <AdminContent />
    </Suspense>
  );
}
