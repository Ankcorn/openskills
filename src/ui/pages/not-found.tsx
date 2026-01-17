import { Header, Layout } from "../layout.js";

interface NotFoundPageProps {
	message?: string;
}

export function NotFoundPage({
	message = "The page you're looking for doesn't exist.",
}: NotFoundPageProps) {
	return (
		<Layout title="Not Found">
			<Header />
			<div class="text-center py-16">
				<h1 class="text-6xl font-bold text-gray-900 mb-4">404</h1>
				<p class="text-gray-500 mb-8">{message}</p>
				<a href="/" class="btn">
					go home
				</a>
			</div>
		</Layout>
	);
}
