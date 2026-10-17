import { Link } from 'react-router';
import LegalPage, { ContactLink, Section } from '@/components/legal-page';

/** The rules for using the site, kept short and plain. */
export default function TermsPage() {
    return (
        <LegalPage title="Terms of service" updated="17 October 2026">
            <Section title="Using this site">
                <p>
                    This is a free, personal project. It is offered as it is, without any promise
                    that it works without errors or stays available.
                </p>
            </Section>

            <Section title="Your account">
                <p>
                    A guest account belongs to the browser it was made in and is deleted when you
                    sign out or after 7 days without activity. A Google account can be deleted at
                    any time from the avatar menu.
                </p>
            </Section>

            <Section title="Fair use">
                <p>
                    Don't use bots or scripts to create accounts, copy the site's content or
                    overload it. Accounts that do may be removed.
                </p>
            </Section>

            <Section title="Content">
                <p>
                    Film and TV information and images come from TMDB. This product uses the TMDB
                    API but is not endorsed or certified by TMDB. Video streams and subtitles come
                    from third-party services that this site doesn't control, and the site doesn't
                    store any video.
                </p>
            </Section>

            <Section title="Liability and changes">
                <p>
                    As far as the law allows, the operator isn't liable for losses caused by using
                    the site. These terms and the site itself may change or stop at any time; the
                    date above shows the current version.
                </p>
            </Section>

            <Section title="Contact">
                <p>
                    Questions: <ContactLink />. How your data is handled is explained in the{' '}
                    <Link to="/privacy" className="underline underline-offset-4">
                        privacy notice
                    </Link>
                    .
                </p>
            </Section>
        </LegalPage>
    );
}
