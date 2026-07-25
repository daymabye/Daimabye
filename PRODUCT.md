# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Clienta principal: **graduandas y quinceañeras de Portoviejo (Ecuador)**. Llegan con un
evento de fecha fija ya decidida y poco margen de error: el día termina en fotos, video,
baile y muchas horas fuera de casa. Suelen descubrir el estudio por Instagram y escriben
por WhatsApp desde el celular.

Audiencias secundarias presentes en el portafolio, sin ser el foco: novias, eventos
sociales y clientas de piel madura.

## Product Purpose

Sitio de una sola página de **Daima Belleza Studio**, un estudio de maquillaje y peinado
en Portoviejo. Existe para convertir el interés que nace en Instagram en una cita
concreta: mostrar el trabajo real, dejar claros servicios y precios, y bajar la reserva a
WhatsApp con el mensaje ya escrito. Éxito = la clienta llega a WhatsApp sabiendo qué
servicio quiere y en qué fecha.

## Positioning

**Durabilidad y acabado fotogénico.** El maquillaje está pensado para aguantar el flash,
el video y las horas completas de un evento sin decaer: pestañas a elección, triple
sellado en el servicio de graduación, fijadores y preparación capilar con protector
térmico. No se vende como "maquillaje bonito" sino como un acabado que sobrevive al día.

La bio pública del estudio añade el matiz de *realzar, no disfrazar* — la clienta debe
verse como ella misma en su mejor versión.

## Operating Context

- Descubrimiento por Instagram (@daimabellezastudio) y TikTok (@daimapromakeup).
- La reserva ocurre **por WhatsApp** al +593 95 875 7109. El formulario del sitio no
  guarda nada: arma un mensaje con nombre, correo, fecha tentativa y plan elegido, y abre
  WhatsApp con ese texto listo para enviar.
- Atención presencial en el estudio, Portoviejo, referencia pública Av. 15 de Abril.
- Uso mayoritariamente móvil: la clienta navega desde el teléfono, con una mano.

## Capabilities and Constraints

- Sitio estático (HTML + CSS + JS, sin framework ni build). Fondo 3D con Three.js r128
  cargado por CDN. Desplegado en Vercel (`soydaima.vercel.app`); el repo de trabajo vive
  en el servidor, en `/root/daima-web`, y se publica con `vercel --prod`.
- No hay backend, carrito, pagos en línea, cuentas de usuario ni calendario propio.
  Tampoco hay disponibilidad en tiempo real: la fecha que elige la clienta es *tentativa*
  y se confirma por WhatsApp.
- Contenido en español (Ecuador). Sin i18n.
- **Precios reales y vigentes — no se inventan, redondean ni "ajustan" al diseñar**
  (confirmado por el dueño del producto):
  - Maquillaje Social Profesional: $20
  - Maquillaje de Graduación Profesional: $25
  - Peinados: planchado $10 · ondas normales $15 · ondas de reina/agua $20 ·
    semirecogido y recogido $20
  - Combo Consentidor: $25 (antes $35) — social + ondas sueltas
  - Combo Pasarela: $35 (antes $40) — maquillaje a elección + ondas de reina

## Brand Commitments

- Nombre: **Daima Belleza Studio**. Descriptor: "Makeup · Hairstyle · Portoviejo".
- Marca gráfica: monograma "dm" en cursiva acompañado de un trazo de delineado (ala) en
  dorado.
- Tipografías en uso: Playfair Display (títulos), Inter (texto), Dancing Script
  (monograma).
- Paleta cálida y neutra: crema de fondo, texto café oscuro, acentos en dorado arena.
- Voz cercana y en primera persona ("Hola, soy Daima"), sin tecnicismos.

## Evidence on Hand

- Portafolio con **fotografías reales del Instagram público del estudio**, descargadas a
  `assets/instagram/` para no depender de enlaces temporales. No usar imágenes de stock.
- Retrato editorial de la maquilladora en `assets/profile_new.jpg`.
- Servicios, precios y ubicación provienen del contenido publicado por el estudio.
- **No existen** testimonios, reseñas, número de clientas atendidas, premios ni métricas
  verificables. No inventarlos ni insinuarlos.

## Product Principles

1. **La reserva es el único objetivo.** Cada sección debe acercar a la clienta a escribir
   por WhatsApp; lo que no ayude a eso sobra.
2. **El trabajo real manda.** Las fotos del estudio son el argumento de venta más fuerte;
   el diseño las enmarca, no compite con ellas.
3. **Móvil primero, de verdad.** La clienta decide desde el teléfono; cualquier cosa que
   solo funcione con mouse o con hover está rota.
4. **Precios y datos, literales.** Montos, ubicación y contacto se muestran tal cual son.
5. **Durabilidad como promesa visible.** Lo que diferencia al estudio (acabado que aguanta
   cámara y horas) debe leerse, no quedar implícito.

## Accessibility & Inclusion

Sin requisito normativo establecido por el negocio. Restricciones prácticas asumidas por
el contexto de uso: objetivos táctiles de 44 px o más, nada que dependa de `:hover`, y
respeto a `prefers-reduced-motion` (el sitio tiene fondo 3D y micro-animaciones).
