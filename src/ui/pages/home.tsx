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
	downloads?: number;
}

interface HomePageProps {
	topSkills: Skill[];
}

export function HomePage({ topSkills }: HomePageProps) {
	return (
		<Layout>
			<Header />
			<SearchBox />
			<Section title="top skills">
				<SkillList>
					{topSkills.length > 0 ? (
						topSkills.map((skill) => (
							<SkillCard
								namespace={skill.namespace}
								name={skill.name}
								version={skill.version}
								downloads={skill.downloads}
							/>
						))
					) : (
						<p class="text-gray-500 text-sm">
							No skills published yet. Be the first to{" "}
							<a href="/create" class="underline">
								create one
							</a>
							!
						</p>
					)}
				</SkillList>
			</Section>
		</Layout>
	);
}
