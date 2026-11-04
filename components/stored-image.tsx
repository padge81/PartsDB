/* eslint-disable @next/next/no-img-element */
"use client";

import type { ComponentPropsWithRef } from "react";

type StoredImageProps = ComponentPropsWithRef<"img"> & { src: string; alt: string };

/** Signed Storage URLs and prepared uploads must reach the browser unchanged.
 * The next/image compatibility layer applies CDN sizing and inline cropping
 * to remote Storage images, even when unoptimized is requested. */
export default function StoredImage({ alt, loading = "lazy", decoding = "async", ...props }: StoredImageProps) {
  return <img {...props} alt={alt} loading={loading} decoding={decoding}/>;
}
