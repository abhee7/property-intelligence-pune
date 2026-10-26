const SPARK_PATH = "M12 0C12 6 14 10 18 12C14 14 12 18 12 24C12 18 10 14 6 12C10 10 12 6 12 0Z";

function Spark() {
  return (
    <svg viewBox="0 0 24 24" fill="#F4F6FA">
      <path d={SPARK_PATH} />
    </svg>
  );
}

/** Six sparks tucked behind the button, ported from a Uiverse hover-button; fly outward on hover via CSS in globals.css. */
export default function StarBurst() {
  return (
    <span className="pi-star-wrap" aria-hidden="true">
      <span className="pi-star pi-star-1"><Spark /></span>
      <span className="pi-star pi-star-2"><Spark /></span>
      <span className="pi-star pi-star-3"><Spark /></span>
      <span className="pi-star pi-star-4"><Spark /></span>
      <span className="pi-star pi-star-5"><Spark /></span>
      <span className="pi-star pi-star-6"><Spark /></span>
    </span>
  );
}
