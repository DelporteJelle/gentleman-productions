import Image from "next/image";
import { TeamMember } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import styles from "./MemberCard.module.css";

export interface MemberCardProps {
  member: TeamMember;
}

export default function MemberCard({ member }: MemberCardProps) {
  const { main, accent } = splitTitleAccent(member.member_name);
  console.log(member.image);
  return (
    <article className={styles.card}>
      <div className={styles.photoWrap}>
        <Image
          src={member.image || "/Placeholders/Person.jpg"}
          alt={member.member_name}
          fill
          sizes="220px"
          className={styles.photo}
          unoptimized
        />
      </div>
      <span className={styles.divider} aria-hidden="true" />
      <h3 className={styles.name}>
        {main}
        {accent && (
          <>
            {" "}
            <span className={styles.nameAccent}>{accent}</span>
          </>
        )}
      </h3>
      <p className={styles.role}>{member.member_role}</p>
    </article>
  );
}
