"use client";

import { TeamMember, Partner } from "@/types";
import { useAbout } from "../contexts/AboutContext";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import {
  LoadingScreen,
  ErrorScreen,
} from "@/components/StateScreens/StateScreens";
import styles from "./page.module.css";

const ABOUT_DESCRIPTION = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

export default function About() {
  const { teamMembers, partners, error, loading } = useAbout();

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  const paragraphs = ABOUT_DESCRIPTION.trim().split(/\n\s*\n/);

  return (
    <div>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="About Gentleman Productions">
        <div className={styles.heroGrid}>
          <h1 className={styles.title}>
            The men behind{" "}
            <span className={styles.titleAccent}>Gentleman</span>{" "}
            Productions.
          </h1>
          <div className={styles.description}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.teamSection} aria-labelledby="team-heading">
        <SectionLabel id="team-heading">Meet the Team</SectionLabel>
        <div className={styles.teamGrid}>
          {teamMembers?.map((member: TeamMember) => (
            <MemberCard key={member.uuid} member={member} />
          ))}
        </div>
      </section>

      <section
        className={styles.partnersSection}
        aria-labelledby="partners-heading"
      >
        <SectionLabel id="partners-heading">Our Partners</SectionLabel>
        <div className={styles.partnersGrid}>
          {partners?.map((partner: Partner) => (
            <PartnerCard key={partner.uuid} partner={partner} />
          ))}
        </div>
      </section>
    </div>
  );
}
