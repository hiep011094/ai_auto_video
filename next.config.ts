import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  compress: true,
  outputFileTracingExcludes: {'/*': ['./config/token*.json','./config/*key*.json','./config/credentials*.json','./config/client_secret*.json','./database/**/*','./data/**/*','./scratch/**/*','./.venv/**/*','./saydi_AI/**/*','./Convert_giong_noi/**/*','./tool_labs_flow/**/*','./text_to_speech/node_modules/**/*']},
  async headers() { return [{source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}]; },
};
export default nextConfig;
