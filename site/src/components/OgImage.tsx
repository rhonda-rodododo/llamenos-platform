interface OgImageProps {
  title: string;
  tag?: string;
}

export function OgImage({ title, tag }: OgImageProps) {
  return {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        background: '#0a0f14',
        display: 'flex',
        flexDirection: 'column',
        padding: '60px 80px',
        position: 'relative',
        fontFamily: 'DM Sans, sans-serif',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              inset: 0,
              opacity: 0.03,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '60px',
              left: '80px',
              right: '80px',
              height: '2px',
              background: 'linear-gradient(90deg, #51AFAE, transparent)',
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '20px',
              marginBottom: 'auto',
            },
            children: [
              {
                type: 'svg',
                props: {
                  width: '32',
                  height: '32',
                  viewBox: '150 150 724 724',
                  style: { borderRadius: '6px' },
                  children: [
                    {
                      type: 'rect',
                      props: {
                        x: '150',
                        y: '150',
                        width: '724',
                        height: '724',
                        rx: '80',
                        fill: '#020A12',
                      },
                    },
                    {
                      type: 'path',
                      props: {
                        fill: '#51AFAE',
                        d: 'M256.491 316.375C267.844 289.533 284.522 283.443 309.189 273.144L346.358 257.438L444.777 215.638C459.569 209.36 474.449 202.83 489.25 196.615C509.854 187.962 522.548 190.741 541.984 199.008L685.972 260.678L720.17 275.104C726.706 277.858 738.876 282.836 744.483 286.712C754.627 293.675 762.468 303.501 767.007 314.937C773.473 330.847 771.467 361.141 771.472 379.363L771.478 462.979L771.503 534.529C771.515 554.576 771.856 575.523 769.532 595.447C766.601 620.898 759.985 645.788 749.891 669.335C722.878 732.154 670.264 784.904 606.543 810.177C543.051 835.695 471.978 834.685 409.236 807.374C346.678 780.164 295.932 726.142 270.593 662.85C261.546 640.251 253.689 608.39 252.995 583.928C252.022 571.321 252.466 554.748 252.468 541.844L252.5 471.342C283.758 482.92 299.306 478.76 328.02 466.844C336.451 463.36 344.939 460.017 353.482 456.817C384.791 444.941 403.801 444.247 432.391 464.427C432.233 460.39 426.785 452.845 423.552 450.012C407.882 436.28 382.424 431.826 362.358 434.899C349.54 436.862 337.595 441.152 324.382 441.444C298.218 442.023 276.272 436.436 256.922 418.738L252.497 414.38L252.456 361.154C252.434 344.965 251.295 332.091 256.491 316.375Z',
                      },
                    },
                  ],
                },
              },
              {
                type: 'span',
                props: {
                  style: {
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#a0a0a0',
                    letterSpacing: '-0.01em',
                  },
                  children: 'Llámenos',
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', marginBottom: 'auto', marginTop: '40px' },
            children: {
              type: 'h1',
              props: {
                style: {
                  fontSize: '56px',
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  maxWidth: '900px',
                },
                children: title,
              },
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: tag ? 'space-between' : 'flex-end',
              marginTop: 'auto',
            },
            children: [
              tag
                ? {
                    type: 'span',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 16px',
                        borderRadius: '9999px',
                        background: 'rgba(81, 175, 174, 0.15)',
                        color: '#5BC5C5',
                        fontSize: '14px',
                        fontWeight: 500,
                      },
                      children: tag,
                    },
                  }
                : null,
              {
                type: 'span',
                props: {
                  style: { fontSize: '14px', color: '#666666' },
                  children: 'llamenos-hotline.com',
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}
