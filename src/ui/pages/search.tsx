import {
	Header,
	Layout,
	SearchBox,
	Section,
	SkillCard,
	SkillList,
} from "../layout.js";

interface Skill {
	namespace: string;
	name: string;
	version?: string;
}

interface SearchPageProps {
	query: string;
	results: Skill[];
	isAuthenticated?: boolean;
}

export function SearchPage({
	query,
	results,
	isAuthenticated,
}: SearchPageProps) {
	return (
		<Layout title={`Search: ${query}`}>
			<Header isAuthenticated={isAuthenticated} />
			<SearchBox value={query} />

			<Section title={`results for "${query}"`}>
				<SkillList>
					{results.length > 0 ? (
						results.map((skill) => (
							<SkillCard
								namespace={skill.namespace}
								name={skill.name}
								version={skill.version}
							/>
						))
					) : (
						<p class="text-gray-500 text-sm">
							No skills found matching "{query}".
						</p>
					)}
				</SkillList>
			</Section>
		</Layout>
	);
}
