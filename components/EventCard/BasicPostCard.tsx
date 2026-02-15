import React from "react";
import { BasicPost, Post } from "@/types";
import styles from "./EventCard.module.css";
import { Image } from "@mantine/core";
import { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";
import TextPlugin from "gsap/TextPlugin";
import { IconPhotoOff } from "@tabler/icons-react";

interface BasicPostCardProps {
  post: BasicPost;
  index?: number;
}

const BasicPostCard: React.FC<BasicPostCardProps> = ({ post, index = 0 }) => {
  gsap.registerPlugin(TextPlugin);
  const cardRef = useRef(null);
  const titleRef = useRef(null);
  const descriptionRef = useRef(null);
  const btnRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isVertical, setIsVertical] = useState(false);

  // Detect image orientation by preloading
  useEffect(() => {
    if (!post.display_image) return;
    const img = new window.Image();
    img.onload = () => {
      setIsVertical(img.naturalHeight > img.naturalWidth);
      setImageLoaded(true);
    };
    img.onerror = () => setImageError(true);
    img.src = post.display_image;
  }, [post.display_image]);

  useEffect(() => {
    if (cardRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const tl = gsap.timeline();
              tl.to(cardRef.current, {
                duration: 1,
                opacity: 1,
                width: "100%",
              })
                .to(
                  titleRef.current,
                  { duration: 1, text: post.title, opacity: 1 },
                  "+0.1",
                );

              if (post.description) {
                tl.to(
                  descriptionRef.current,
                  { duration: 2, text: post.description, opacity: 1 },
                  "+0.5",
                );
              }

              if (post.link) {
                tl.to(btnRef.current, { duration: 1, opacity: 1 }, "+=0");
              }

              observer.unobserve(cardRef!.current!);
            }
          });
        },
        {
          threshold: 0.1,
        },
      );

      observer.observe(cardRef.current);

      return () => {
        if (cardRef.current) {
          observer.unobserve(cardRef.current);
        }
      };
    }
  }, [post.title, post.description, post.link]);

  return (
    <div className={styles.card_wrapper}>
      <div
        ref={cardRef}
        className={index % 2 ? styles.card_reverse : styles.card}
        style={{ opacity: 0, transformOrigin: "center center", width: "0%" }}
      >
        <div
          className={styles.card_img}
          style={{ width: isVertical ? "35%" : undefined }}
        >
          <div
            className={styles.image_skeleton}
            style={{
              opacity: imageLoaded || imageError ? 0 : 0.7,
              transition: "opacity 0.3s ease",
            }}
          />
          {imageError ? (
            <div className={styles.image_error}>
              <IconPhotoOff size={64} stroke={1.5} />
              <p>Image not available</p>
            </div>
          ) : (
            <Image
              src={post.display_image}
              alt={post.title}
              height={450}
              style={{
                objectFit: "cover",
                opacity: imageLoaded ? 1 : 0,
                transition: "opacity 0.3s ease",
              }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}
        </div>
        <div
          className={styles.card_txt}
          style={{ width: isVertical ? "65%" : undefined }}
        >
          <h2 ref={titleRef}></h2>
          {(post.date || post.location) && (
            <div className="date mt-4" style={{ opacity: 0.8 }}>
              {post.date &&
                new Date(post.date).toLocaleDateString("nl-BE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              {post.date && post.location && " — "}
              {post.location}
            </div>
          )}
          {post.description && (
            <div style={{ whiteSpace: "pre-wrap" }} ref={descriptionRef}></div>
          )}
          {post.link && (
            <a
              href={post.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <button
                ref={btnRef}
                className="btn-yellow"
                style={{ opacity: 0 }}
              >
                {post.link_text || "Learn more"}
              </button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default BasicPostCard;
