import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const CanvasBackground: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const world = {
      plane: {
        width: 400,
        height: 400,
        widthSegments: 50,
        heightSegments: 50,
      },
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current?.appendChild(renderer.domElement);

    const planeGeometry = new THREE.PlaneGeometry(
      world.plane.width,
      world.plane.height,
      world.plane.widthSegments,
      world.plane.heightSegments,
    );
    const planeMaterial = new THREE.MeshPhongMaterial({
      side: THREE.DoubleSide,
      flatShading: true,
      vertexColors: true,
    });
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(planeMesh);

    // const light = new THREE.DirectionalLight(0xffffff, 1);
    // light.position.set(0, -1, 2);
    // scene.add(light);
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-1, 1, 0.3);
    scene.add(light);

    const backLight = new THREE.DirectionalLight(0xff0000, 2);
    backLight.position.set(1, -1, 0.3);
    scene.add(backLight);

    const pointLight = new THREE.PointLight(0xff0000, 1000, 0); // Increased intensity and added distance
    pointLight.position.set(0, -1, 1); // Adjust the position
    scene.add(pointLight);

    camera.position.z = 50;

    const generatePlane = () => {
      planeMesh.geometry.dispose();
      planeMesh.geometry = new THREE.PlaneGeometry(
        world.plane.width,
        world.plane.height,
        world.plane.widthSegments,
        world.plane.heightSegments,
      );

      const { array } = planeMesh.geometry.attributes.position;
      const randomValues = [];
      for (let i = 0; i < array.length; i++) {
        if (i % 3 === 0) {
          const x = array[i];
          const y = array[i + 1];
          const z = array[i + 2];

          array[i] = x + (Math.random() - 0.5) * 3;
          array[i + 1] = y + (Math.random() - 0.5) * 3;
          array[i + 2] = z + (Math.random() - 0.5) * 3;
        }

        randomValues.push(Math.random() * Math.PI * 2);
      }

      (planeMesh.geometry.attributes.position as any).randomValues = (
        planeMesh.geometry.attributes.position as THREE.BufferAttribute & {
          originalPosition: Float32Array;
        }
      ).originalPosition = planeMesh.geometry.attributes.position
        .array as Float32Array;
      planeMesh.geometry.attributes.position.array;

      const colors = [];
      for (let i = 0; i < planeMesh.geometry.attributes.position.count; i++) {
        colors.push(0.01, 0.01, 0.01);
        // colors.push(0.01, 0.01, 0.01);
      }

      planeMesh.geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(colors), 3),
      );
    };

    generatePlane();

    const mouse = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();

    window.addEventListener("mousemove", (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    const animate = () => {
      requestAnimationFrame(animate);

      const positionAttribute = planeMesh.geometry.attributes
        .position as THREE.BufferAttribute & {
        originalPosition: Float32Array;
        randomValues: number[];
      };
      const { array, randomValues } = positionAttribute;
      const originalPosition = (planeMesh.geometry.attributes.position as any)
        .originalPosition;
      for (let i = 0; i < array.length; i += 3) {
        array[i] =
          originalPosition[i] +
          Math.cos(randomValues[i] + performance.now() * 0.001) * 0.01;
        array[i + 1] =
          originalPosition[i + 1] +
          Math.sin(randomValues[i + 1] + performance.now() * 0.001) * 0.01;
      }
      planeMesh.geometry.attributes.position.needsUpdate = true;

      pointLight.position.x = mouse.x * 50;
      pointLight.position.y = mouse.y * 50;
      pointLight.position.z = 20;
      //   raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);
      //   const intersects = raycaster.intersectObject(planeMesh);
      //   if (intersects.length > 0) {
      //     const intersect = intersects[0];
      //     pointLight.position.copy(intersect.point);
      //   }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} />;
};

export default CanvasBackground;
