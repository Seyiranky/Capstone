import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Flex, Modal, Slider, Tooltip, Typography } from 'antd';
import { RotateRightOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';

/** The stage is square; the round crop sits inside it with this margin. */
const STAGE = 300;
const MARGIN = 24;
const CROP = STAGE - 2 * MARGIN;
/** The saved picture: square, enough for a large profile header. */
const OUTPUT = 512;
const MAX_ZOOM = 4;

interface Offset {
  x: number;
  y: number;
}

/**
 * Crops a chosen photo to a round profile picture.
 *
 * The photo is dragged under a fixed circle and zoomed with the slider, the
 * mouse wheel or the buttons; it can be turned a quarter at a time. The photo
 * always covers the circle, so the result never has empty corners. Done draws
 * the part inside the circle's square to a 512px JPEG.
 */
const AvatarCropModal = ({
  file,
  saving,
  onCancel,
  onDone,
}: {
  file: File | null;
  saving: boolean;
  onCancel: () => void;
  onDone: (image: Blob) => void;
}) => {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ start: Offset; from: Offset } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setNatural(null);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // A quarter turn swaps the photo's width and height as the circle sees it.
  const turned = rotation % 180 !== 0;
  const rw = natural ? (turned ? natural.h : natural.w) : 1;
  const rh = natural ? (turned ? natural.w : natural.h) : 1;
  const base = CROP / Math.min(rw, rh);
  const scale = base * zoom;

  /** Keeps the photo covering the circle's square. */
  const clamp = (o: Offset, s = scale): Offset => {
    const maxX = Math.max(0, (rw * s - CROP) / 2);
    const maxY = Math.max(0, (rh * s - CROP) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  };

  const zoomTo = (z: number | ((current: number) => number)) => {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, typeof z === 'function' ? z(current) : z));
      setOffset((o) => clamp(o, base * next));
      return next;
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: { x: e.clientX, y: e.clientY }, from: offset };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { start, from } = drag.current;
    setOffset(clamp({ x: from.x + e.clientX - start.x, y: from.y + e.clientY - start.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };
  // Successive wheel events add up even before the next render.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => zoomTo((z) => z - e.deltaY * 0.0015);

  const rotate = () => {
    setRotation((r) => (r + 90) % 360);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const done = () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // White behind transparent PNGs, which JPEG cannot keep.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.imageSmoothingQuality = 'high';
    // The same transform the stage shows, measured from the circle's centre.
    ctx.translate(OUTPUT / 2, OUTPUT / 2);
    ctx.scale(OUTPUT / CROP, OUTPUT / CROP);
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
    canvas.toBlob((blob) => blob && onDone(blob), 'image/jpeg', 0.9);
  };

  return (
    <Modal
      open={Boolean(file)}
      title={t('avatar.cropTitle')}
      onCancel={onCancel}
      width={STAGE + 48 + 2}
      centered
      destroyOnHidden
      maskClosable={false}
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" onClick={done} loading={saving} disabled={!natural}>
            {t('avatar.done')}
          </Button>
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
        {t('avatar.cropHint')}
      </Typography.Paragraph>
      <div
        className={`isoko-crop${dragging ? ' isoko-crop--dragging' : ''}`}
        style={{ width: STAGE, height: STAGE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="application"
        aria-label={t('avatar.cropTitle')}
      >
        {src && (
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="isoko-crop__img"
            style={{
              width: natural?.w,
              height: natural?.h,
              opacity: natural ? 1 : 0,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`,
            }}
          />
        )}
        {/* The circle: everything outside it is dimmed, with a border and a thirds grid inside. */}
        <div className="isoko-crop__frame" style={{ inset: MARGIN }}>
          <span className="isoko-crop__grid" />
        </div>
      </div>
      <Flex align="center" gap={10} style={{ marginTop: 16 }}>
        <Tooltip title={t('avatar.zoomOut')}>
          <Button type="text" size="small" icon={<ZoomOutOutlined />} onClick={() => zoomTo((z) => z - 0.25)} />
        </Tooltip>
        <Slider
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={zoomTo}
          tooltip={{ open: false }}
          style={{ flex: 1, margin: 0 }}
          aria-label={t('avatar.zoom')}
        />
        <Tooltip title={t('avatar.zoomIn')}>
          <Button type="text" size="small" icon={<ZoomInOutlined />} onClick={() => zoomTo((z) => z + 0.25)} />
        </Tooltip>
        <Tooltip title={t('avatar.rotate')}>
          <Button size="small" icon={<RotateRightOutlined />} onClick={rotate} />
        </Tooltip>
      </Flex>
    </Modal>
  );
};

export default AvatarCropModal;
