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
	isAuthenticated?: boolean;
}

export function HomePage({ topSkills, isAuthenticated }: HomePageProps) {
	return (
		<Layout>
			<Header isAuthenticated={isAuthenticated} />
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
							No skills published yet.
							{isAuthenticated ? (
								<>
									{" "}
									Be the first to{" "}
									<a href="/create" class="underline">
										create one
									</a>
									!
								</>
							) : (
								" Sign in to create one!"
							)}
						</p>
					)}
				</SkillList>
			</Section>
		</Layout>
	);
}
