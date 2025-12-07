/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config, { isServer }) => {
		if (isServer) {
			// Avoid bundling native .node files; treat as externals
			config.externals = config.externals || [];
			config.externals.push('@napi-rs/canvas');
			config.externals.push('@napi-rs/canvas-win32-x64-msvc');
			// Ensure .node files aren't parsed by webpack
			config.module.rules.push({
				test: /\.node$/,
				use: [],
				type: 'javascript/auto'
			});
		}
		return config;
	},
	serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist']
};

export default nextConfig;