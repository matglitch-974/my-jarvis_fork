/* Scene de controle 3D — sert a verifier que le rendu WebGL sort autre chose
   que du noir. Teintes de My Jarvis. */

export default {
  titre: "Controle 3D — sphere, socle, reperes",
  type: "3d",
  fond: "#06080D",
  duree: 3,
  cadre: { rayon: 3.4, hauteur: 1.15, cible: [0, 0.15, 0], arc: 1 },

  construire(THREE, scene) {
    scene.add(new THREE.AmbientLight(0x4a9eff, 0.35));

    const cle = new THREE.DirectionalLight(0xdce8ff, 1.5);
    cle.position.set(3, 4, 2);
    scene.add(cle);

    const contre = new THREE.DirectionalLight(0x4a9eff, 0.9);
    contre.position.set(-3, 1.2, -2.5);
    scene.add(contre);

    const sphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 4),
      new THREE.MeshStandardMaterial({
        color: 0x1a3a5c, metalness: 0.55, roughness: 0.22,
        emissive: 0x0a1420, emissiveIntensity: 0.6
      })
    );
    sphere.position.y = 0.5;
    scene.add(sphere);

    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.92, 3),
      new THREE.MeshBasicMaterial({ color: 0x4a9eff, wireframe: true,
                                    transparent: true, opacity: 0.22 })
    );
    halo.position.y = 0.5;
    scene.add(halo);

    const socle = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.05, 64),
      new THREE.MeshStandardMaterial({ color: 0x0f141f, roughness: 0.85 })
    );
    scene.add(socle);

    const grille = new THREE.GridHelper(6, 12, 0x4a9eff, 0x161c2a);
    grille.position.y = -0.024;
    scene.add(grille);

    // Trois reperes colores pour lire l'orientation d'un coup d'oeil.
    const reperes = [];
    [[0xB8963E, 0], [0x36D399, 2.094], [0xE5484D, 4.189]].forEach(([c, a]) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.16),
        new THREE.MeshStandardMaterial({ color: c, emissive: c,
                                         emissiveIntensity: 0.35, roughness: 0.4 })
      );
      m.position.set(Math.cos(a) * 1.25, 0.12, Math.sin(a) * 1.25);
      scene.add(m);
      reperes.push(m);
    });

    return { sphere, halo, reperes };
  },

  animer(t, o) {
    o.sphere.rotation.y = t * Math.PI * 2;
    o.halo.rotation.y = -t * Math.PI * 2;
    o.halo.rotation.x = t * Math.PI;
    o.sphere.position.y = 0.5 + Math.sin(t * Math.PI * 2) * 0.06;
    o.halo.position.y = o.sphere.position.y;
    o.reperes.forEach((m, i) => { m.rotation.y = t * Math.PI * 2 * (i + 1); });
  }
};
