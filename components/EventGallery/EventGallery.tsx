"use client";

import { useState } from "react";
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";
import { IconPhotoOff } from "@tabler/icons-react";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import Lightbox from "./Lightbox";
import styles from "./EventGallery.module.css";

interface EventGalleryProps {
  images: string[];
  title: string;
}

interface GalleryTileProps {
  src: string;
  alt: string;
  ariaLabel: string;
  onOpen: () => void;
}

function GalleryTile({ src, alt, ariaLabel, onOpen }: GalleryTileProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <button
      type="button"
      className={styles.tile}
      onClick={onOpen}
      aria-label={ariaLabel}
    >
      <span className={styles.spotlightGlow}></span>
      <div className={styles.frameInner}>
        {!loaded && !error && <div className={styles.imageSkeleton} />}
        {error ? (
          <div className={styles.imageError}>
            <IconPhotoOff size={48} stroke={1.5} />
            <p>Image unavailable</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={styles.frameImg}
            style={{ opacity: loaded ? 1 : 0 }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}
      </div>
    </button>
  );
}

export default function EventGallery({ images, title }: EventGalleryProps) {
  const validImages = images.filter(Boolean);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (validImages.length === 0) return null;

  const N = validImages.length;

  return (
    <section className={styles.section} aria-label="Production gallery">
      <SectionLabel>The Production Gallery</SectionLabel>
      <ResponsiveMasonry columnsCountBreakPoints={{ 400: 1, 800: 2, 1200: 3, 1600: 3 }}>
        <Masonry gutter="24px">
          {validImages.map((src, i) => (
            <GalleryTile
              key={src}
              src={src}
              alt={`${title} — image ${i + 1}`}
              ariaLabel={`Open image ${i + 1} of ${N}`}
              onOpen={() => setLightboxIndex(i)}
            />
          ))}
        </Masonry>
      </ResponsiveMasonry>
      <Lightbox
        images={validImages}
        title={title}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onPrev={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + N) % N))}
        onNext={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % N))}
      />
    </section>
  );
}
