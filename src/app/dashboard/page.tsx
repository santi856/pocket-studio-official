import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserForPage } from "@/lib/web/require-user";
import { listOrganizationsForUser } from "@/lib/services/organizations";
import { listProjectsForOrganization } from "@/lib/services/projects";
import { AppNav } from "@/components/app-nav";

export default async function DashboardPage() {
  const user = await requireUserForPage();
  const organizations = await listOrganizationsForUser(user.id);

  if (organizations.length === 0) {
    redirect("/onboarding");
  }

  const projectsByOrg = await Promise.all(
    organizations.map(async (org) => ({
      organization: org,
      projects: await listProjectsForOrganization(user.id, org.id),
    })),
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={user.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
        {projectsByOrg.map(({ organization, projects }) => (
          <section key={organization.id} className="mb-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-black dark:text-white">
                {organization.name}
              </h2>
              <Link
                href={`/org/${organization.slug}/billing`}
                className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Billing
              </Link>
            </div>

            {projects.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No projects yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/org/${organization.slug}/${project.slug}`}
                      className="block px-4 py-3 text-sm text-black transition-colors hover:bg-zinc-50 dark:text-white dark:hover:bg-zinc-900"
                    >
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href={`/org/${organization.slug}`}
              className="mt-3 inline-block text-sm font-medium text-black underline dark:text-white"
            >
              New project →
            </Link>
          </section>
        ))}
      </main>
    </div>
  );
}
