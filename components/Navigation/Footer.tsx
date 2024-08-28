import { Group, Image, Stack } from "@mantine/core";
import Socials from "./Socials";
import styles from "./styles.module.css";

export default function Footer() {
  return (
    <div className={styles.footer}>
      <div className={styles.logo}>
        <Image
          src="/GP-logo.svg"
          alt="/home/"
          width={45}
          height={45}
          style={{ objectFit: "contain" }}
        />
      </div>
      <Group visibleFrom="sm">
        <Stack gap={"0px"}>
          <span className="bold underline">Contact</span>
          <span>gentlemanproductions.official@gmail.com</span>
        </Stack>
        <Stack gap={"0px"}>
          <span className="bold underline">Address</span>
          <span>Bergbosstraat 55</span>
          <span>9820 Merelbeke</span>
        </Stack>
      </Group>
      {/* <div className="d-flex flex-row">
        <div className="d-flex flex-column align-items-center mx-3">
          <span className="fw-bold text-decoration-underline ">Contact</span>
          <span>04 12 34 56 78</span>
          <span>gentlemanproductions.official@gmail.com</span>
        </div>
        <div className="d-flex flex-column align-items-center mx-3">
          <span className="fw-bold text-decoration-underline">Address</span>
          <span>Bergbosstraat 55</span>
          <span>9820 Merelbeke</span>
        </div>
      </div> */}
      <Socials />
    </div>
  );
}
