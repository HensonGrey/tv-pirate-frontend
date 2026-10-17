import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ThemeIconButton from '@/components/theme-icon-button';

// A Cloudflare Email Routing alias, so no personal address is published.
const CONTACT_EMAIL = 'privacy@adomination-tv.com';

export function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
            {children}
        </section>
    );
}

export function ContactLink() {
    return (
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
            {CONTACT_EMAIL}
        </a>
    );
}

interface LegalPageProps {
    title: string;
    updated: string;
    children: ReactNode;
}

/** Shell for the public privacy and terms pages, readable without signing in. */
export default function LegalPage({ title, updated, children }: LegalPageProps) {
    return (
        <div className="relative flex min-h-dvh justify-center p-4 sm:py-12">
            <ThemeIconButton className="absolute top-4 right-4 bg-background/50 backdrop-blur-sm" />
            <Card className="h-fit w-full max-w-2xl shadow-lg ring-foreground/25">
                <CardHeader className="gap-1">
                    <CardTitle className="font-heading text-2xl font-bold tracking-tight">
                        {title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Last updated {updated}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
                    {children}
                    <Link to="/" className="text-foreground underline underline-offset-4">
                        Back to the site
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}
