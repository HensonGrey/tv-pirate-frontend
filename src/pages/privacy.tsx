import LegalPage, { ContactLink, Section } from '@/components/legal-page';

/** What the site stores, who else sees it, and the visitor's rights. */
export default function PrivacyPage() {
    return (
        <LegalPage title="Privacy notice" updated="17 October 2026">
            <Section title="Who runs this site">
                <p>
                    This site is a personal project. Questions and requests about your data:{' '}
                    <ContactLink />.
                </p>
            </Section>

            <Section title="What is stored, and why">
                <ul className="flex list-disc flex-col gap-1.5 pl-5">
                    <li>
                        Your account. Guests get a random name. With Google sign-in we keep your
                        Google account ID, name, email address and profile picture link, to sign you
                        in and show who you are.
                    </li>
                    <li>
                        Your favourites and watch progress, so you can pick up where you left off.
                    </li>
                    <li>
                        Sign-in cookies that keep you signed in. They are strictly necessary; there
                        are no tracking or advertising cookies.
                    </li>
                    <li>
                        Your browser remembers your user name, theme and player choices on your own
                        device.
                    </li>
                </ul>
                <p>
                    Your IP address is only used briefly, in memory, to limit how often accounts can
                    be created and requests sent. It is not saved.
                </p>
            </Section>

            <Section title="Who else receives data">
                <ul className="flex list-disc flex-col gap-1.5 pl-5">
                    <li>Oracle Cloud hosts the site and its database in Frankfurt, Germany.</li>
                    <li>Cloudflare R2 keeps a nightly backup copy of the database in the EU.</li>
                    <li>
                        Cloudflare runs the bot check when you continue as a guest and sees your IP
                        address and browser details.
                    </li>
                    <li>Google, only if you sign in with Google.</li>
                    <li>
                        TMDB (The Movie Database) serves the posters and pictures straight to your
                        browser, so it sees your IP address.
                    </li>
                    <li>
                        New Relic (EU region) receives error logs and technical request data, such
                        as which address was called and how long it took, so problems can be found
                        and fixed.
                    </li>
                </ul>
                <p>Your data is never sold or used for advertising.</p>
            </Section>

            <Section title="How long it is kept">
                <ul className="flex list-disc flex-col gap-1.5 pl-5">
                    <li>
                        Guest accounts are deleted, with everything they hold, when you sign out or
                        after 7 days without activity.
                    </li>
                    <li>
                        Google accounts are kept until you delete them: avatar menu → Delete account
                        removes the account and everything it holds at once.
                    </li>
                    <li>Sign-in tokens expire after 30 days and are then deleted.</li>
                    <li>
                        Backup copies are deleted after 30 days, so a deleted account is gone from
                        them within a month.
                    </li>
                    <li>New Relic deletes error logs automatically after a limited time.</li>
                </ul>
            </Section>

            <Section title="Why this is allowed">
                <p>
                    Your account, favourites and progress are needed to provide the service you
                    signed up for (GDPR Art. 6(1)(b)). The bot check, rate limits and error logs
                    keep the site secure and working, which is a legitimate interest (Art. 6(1)(f)).
                </p>
            </Section>

            <Section title="Your rights">
                <p>
                    You can ask for a copy of your data, have it corrected or deleted, restrict or
                    object to its use, or receive it in a portable format: write to <ContactLink />.
                    You can also complain to the Bulgarian Commission for Personal Data Protection (
                    <a
                        href="https://www.cpdp.bg"
                        className="underline underline-offset-4"
                        target="_blank"
                        rel="noreferrer"
                    >
                        cpdp.bg
                    </a>
                    ) or the data protection authority where you live.
                </p>
            </Section>
        </LegalPage>
    );
}
