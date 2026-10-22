import { Flex, Spin } from 'antd';

/** Shown for the moment a page's code is still arriving (pages load on first use). */
const PageLoading = () => (
  <Flex align="center" justify="center" style={{ minHeight: '40vh' }} role="status" aria-live="polite">
    <Spin size="large" />
  </Flex>
);

export default PageLoading;
