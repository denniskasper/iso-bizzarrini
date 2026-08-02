import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="animate-rise">
      <p className="text-2xs text-faint uppercase">Not found</p>
      <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">There is nothing here.</h1>
      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        The address you followed does not point at anything in the archive.
      </p>
      <Button asChild variant="primary" size="lg" className="mt-10">
        <Link to="/">Back to the catalog</Link>
      </Button>
    </div>
  );
}
