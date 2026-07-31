import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @expense/shared là workspace package build ra CommonJS. Khai báo ở đây để
  // Next transpile nó như source của mình thay vì coi là dependency đã build sẵn.
  transpilePackages: ['@expense/shared'],
};

export default nextConfig;
