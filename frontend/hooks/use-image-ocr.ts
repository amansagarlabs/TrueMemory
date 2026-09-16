"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageOcrResponse } from "@/lib/types";
import { readImageWithOcr } from "@/services/api";

export type ImageOcrStatus = "reading" | "ready" | "error";

export type ImageOcrAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  status: ImageOcrStatus;
  result?: ImageOcrResponse;
  error?: string;
};

const MAX_IMAGES = 4;

function isSupportedImage(file: File) {
  return file.type.startsWith("image/");
}

function normalizeImageFile(file: File, index: number) {
  if (/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)) return file;
  const extension = {
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
  }[file.type] ?? "png";
  return new File([file], `Pasted image ${index + 1}.${extension}`, {
    type: file.type || `image/${extension}`,
    lastModified: file.lastModified,
  });
}

export function useImageOcr(onError?: (message: string) => void) {
  const [images, setImages] = useState<ImageOcrAttachment[]>([]);
  const imagesRef = useRef<ImageOcrAttachment[]>([]);
  const liveJobsRef = useRef(new Set<string>());

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    const liveJobs = liveJobsRef.current;
    return () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      liveJobs.clear();
    };
  }, []);

  const addImages = useCallback(async (files: File[]) => {
    const supported = files.filter(isSupportedImage);
    if (!supported.length) {
      onError?.("Use a PNG, JPG, WebP, BMP, or TIFF image.");
      return;
    }

    const availableSlots = Math.max(0, MAX_IMAGES - imagesRef.current.length);
    const selected = supported
      .slice(0, availableSlots)
      .map(normalizeImageFile);
    if (!selected.length) {
      onError?.(`You can attach up to ${MAX_IMAGES} images at once.`);
      return;
    }

    const pending = selected.map((file, index): ImageOcrAttachment => ({
      id: `ocr-${Date.now()}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "reading",
    }));
    pending.forEach((image) => liveJobsRef.current.add(image.id));
    imagesRef.current = [...imagesRef.current, ...pending];
    setImages(imagesRef.current);

    await Promise.all(pending.map(async (image) => {
      try {
        const result = await readImageWithOcr(image.file);
        if (!liveJobsRef.current.has(image.id)) return;
        setImages((current) => current.map((item) =>
          item.id === image.id ? { ...item, status: "ready", result } : item,
        ));
      } catch (error) {
        if (!liveJobsRef.current.has(image.id)) return;
        const message = error instanceof Error ? error.message : "Image OCR failed.";
        setImages((current) => current.map((item) =>
          item.id === image.id ? { ...item, status: "error", error: message } : item,
        ));
        onError?.(message);
      } finally {
        liveJobsRef.current.delete(image.id);
      }
    }));
  }, [onError]);

  const removeImage = useCallback((id: string) => {
    liveJobsRef.current.delete(id);
    setImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = current.filter((image) => image.id !== id);
      imagesRef.current = next;
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    liveJobsRef.current.clear();
    setImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      imagesRef.current = [];
      return [];
    });
  }, []);

  return {
    images,
    addImages,
    removeImage,
    clearImages,
    isReading: images.some((image) => image.status === "reading"),
    readyImages: images.filter((image) => image.status === "ready" && image.result),
  };
}
