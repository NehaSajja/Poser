import { useLayoutEffect, useRef, useState } from 'react';

// One rectangular floor remains behind both the carousel and selected pose.
export default function SelectionGrid({ hidden }) {
  const host = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const resize = () => {
      setSize({ width: host.current.clientWidth, height: host.current.clientHeight });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const horizon = height * .48, focal = Math.max(width, height) * .85;
  const cell = .75;
  const near = focal * 4 / Math.max(1, height - horizon), far = near + 60;
  const projectY = depth => horizon + focal * 4 / depth;
  const extent = Math.ceil(width * far / Math.max(1, 2 * focal * cell));
  const paths = [];
  if (width && height) {
    for (let x = -extent; x <= extent; x++) {
      paths.push(`M${width / 2 + focal * x * cell / far},${projectY(far)}L${width / 2 + focal * x * cell / near},${height}`);
    }
    for (let z = Math.ceil(near / cell) * cell; z <= far; z += cell) {
      paths.push(`M0,${projectY(z)}H${width}`);
    }
  }
  return <div ref={host} className="poser2-selection-grid" aria-hidden="true" data-hidden={hidden}>
    <svg width="100%" height="100%" viewBox={`0 0 ${width || 1} ${height || 1}`}>
      <path d={paths.join('')} fill="none" stroke="rgb(0 0 0 / .12)" strokeWidth="1"/>
    </svg>
  </div>;
}
