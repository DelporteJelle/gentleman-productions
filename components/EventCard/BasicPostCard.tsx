"use client";

import React, { useEffect, useRef, useState } from "react";
import { BasicPost } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import styles from "./EventCard.module.css";
import { Image } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";

interface Props {
  post: BasicPost;
  index?: number;
}

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function actLabel(index: number): string {
  return `Act ${index < ROMANS.length ? ROMANS[index] : index + 1}`;
}

const BasicPostCard: React.FC<Props> = ({ post, index = 0 }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!cardRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, []);

  const { main, accent } = splitTitleAccent(post.title);

  return (
    <div className={styles.cardWrapper}>
      <div
        ref={cardRef}
        className={`${index % 2 ? styles.reverse : ""} ${styles.card} ${visible ? styles.visible : ""}`}
      >
        <div className={styles.spotlightFrame}>
          <div className={styles.frameInner}>
            {imageError ? (
              <div className={styles.imageError}>
                <IconPhotoOff size={64} stroke={1.5} />
                <p>Image not available</p>
              </div>
            ) : (
              <Image
                src={post.display_image}
                alt={post.title}
                className={styles.frameImg}
                style={{
                  opacity: imageLoaded ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </div>

        <div className={styles.cardText}>
          <div className={styles.actNum}>
            {actLabel(index)} &nbsp;·&nbsp; Post
          </div>

          <h2 className={styles.cardTitle}>
            {main}
            {accent && (
              <>
                {" "}
                <span className={styles.it}>{accent}</span>
              </>
            )}
          </h2>

          {(post.date || post.location) && (
            <div className={styles.cardInfo}>
              {post.date && (
                <span>
                  {new Date(post.date).toLocaleDateString("nl-BE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
              {post.date && post.location && (
                <span className={styles.cardInfoSep}>&#9670;</span>
              )}
              {post.location && <span>{post.location}</span>}
            </div>
          )}

          {post.description && (
            <p className={styles.cardDesc}>{post.description}</p>
          )}

          {post.link && (
            <a
              className={styles.cardCta}
              href={post.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {post.link_text || "Learn More"}
              <span className={styles.cardCtaArrow}>&rarr;</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default BasicPostCard;
