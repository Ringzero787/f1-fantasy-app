import React, { Suspense } from 'react';
import { Loading } from '../../../src/components';

const NewsManageContent = React.lazy(() => import('../../../src/admin/NewsManageContent'));

export default function NewsManageScreen() {
  return (
    <Suspense fallback={<Loading fullScreen message="Loading news management..." />}>
      <NewsManageContent />
    </Suspense>
  );
}
