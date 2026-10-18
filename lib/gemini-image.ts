type Part = { thought?: boolean; text?: string; inlineData?: { mimeType?: string; data?: string } };
type ImageResponse = { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: Part[] } }[] };

export function geminiImageData(response: ImageResponse): string {
  if (response.promptFeedback?.blockReason) throw new Error("Gemini did not return an image for this request. Revise the sketch, reference, or prompt.");
  const candidate = response.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new Error("Gemini did not complete the image. Review the saved provider response before retrying.");
  // Thought images are intermediate reasoning, not the finished reference.
  const image = candidate?.content?.parts?.find(p => !p.thought && p.inlineData?.mimeType?.startsWith("image/") && p.inlineData.data)?.inlineData;
  if (!image) throw new Error("Gemini returned no image. Try adjusting the prompt or body reference.");
  return `data:${image.mimeType};base64,${image.data}`;
}
