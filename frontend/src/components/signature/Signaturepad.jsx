import { useEffect, useRef, useState } from "react";

export default function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!value) {
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      return;
    }
    const image = new Image();
    image.onload = () => canvas.getContext("2d").drawImage(image, 0, 0);
    image.src = value;
  }, [value]);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (560 / rect.width),
      y: (event.clientY - rect.top) * (150 / rect.height),
    };
  }

  function start(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvasRef.current.getContext("2d");
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.strokeStyle = "#173f3a";
    drawingRef.current = true;
  }

  function draw(event) {
    if (!drawingRef.current) return;
    const position = point(event);
    const context = canvasRef.current.getContext("2d");
    context.lineTo(position.x, position.y);
    context.stroke();
    setHasSignature(true);
  }

  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange("");
  }

  return (
    <div className="signature-box">
      <canvas
        ref={canvasRef}
        width="560"
        height="150"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="Firma del cliente"
      />
      <div className="signature-footer">
        <span>{hasSignature ? "Firma capturada" : "Firma del cliente"}</span>
        <button type="button" onClick={clear}>
          Limpiar
        </button>
      </div>
    </div>
  );
}
