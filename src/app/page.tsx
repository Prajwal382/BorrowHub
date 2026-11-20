import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/guards";

async function HomeActions() {
  const user = await getCurrentUser();

  if (user) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className="button-primary">
          Go to your dashboard
        </Link>
        <Link href="/catalog" className="button-secondary">
          Browse the catalog
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/login" className="button-primary">
        Log in
      </Link>
      <Link href="/register" className="button-secondary">
        Create account
      </Link>
    </div>
  );
}

const STEPS = [
  {
    title: "Find it",
    text: "Search cameras, laptops, audio kits and more, and see what is available right now.",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>
    ),
  },
  {
    title: "Request it",
    text: "Tell staff what it is for and when you will bring it back. One form, no email chain.",
    icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  },
  {
    title: "Track it",
    text: "See your request status, pickup and due dates on your dashboard.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section className="border-b-4 border-gold bg-sand">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 sm:py-20">
          <span className="self-start rounded-full bg-maroon px-3 py-1.5 text-xs font-semibold tracking-widest text-cream uppercase">
            Department equipment library
          </span>
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-tight text-maroon-dark sm:text-6xl">
            Borrow the gear.
            <br />
            Skip the email chain.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            Find equipment, request what you need, and keep track of what is due back.
          </p>
          <Suspense fallback={null}>
            <HomeActions />
          </Suspense>
        </div>
      </section>

      <section
        aria-labelledby="how-it-works"
        className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"
      >
        <h2 id="how-it-works" className="text-3xl font-extrabold text-maroon-dark">
          How it works
        </h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card flex flex-col gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-sand text-maroon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {step.icon}
                </svg>
              </span>
              <h3 className="text-xl font-bold text-ink">
                <span className="text-maroon">{index + 1}.</span> {step.title}
              </h3>
              <p className="text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
