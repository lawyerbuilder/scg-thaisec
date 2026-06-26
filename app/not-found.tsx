import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container py-32 text-center">
      <p className="eyebrow mb-3">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">We can&apos;t find that page.</h1>
      <p className="mt-3 text-muted-foreground">
        The regulation or page you were looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Back to the library
      </Link>
    </div>
  );
}
