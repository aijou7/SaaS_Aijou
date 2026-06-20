import { getWhatsAppCredentialsForBusiness } from "@/server/whatsapp/settings";

type SendTextMessageParams = {
  to: string;
  body: string;
  businessId?: string | null;
};

type DownloadMediaParams = {
  mediaId: string;
  businessId: string;
};

export async function sendWhatsAppTextMessage(params: SendTextMessageParams) {
  const credentials = params.businessId
    ? await getWhatsAppCredentialsForBusiness(params.businessId)
    : {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      };
  const accessToken = credentials.accessToken;
  const phoneNumberId = credentials.phoneNumberId;

  if (!accessToken || !phoneNumberId) {
    return {
      sent: false,
      reason: "whatsapp_credentials_missing",
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "text",
        text: {
          preview_url: false,
          body: params.body,
        },
      }),
    },
  );

  const body = await readResponseBody(response);

  return {
    sent: response.ok,
    status: response.status,
    body,
  };
}

export async function getWhatsAppMediaDownloadUrl(mediaId: string, businessId?: string) {
  const credentials = businessId
    ? await getWhatsAppCredentialsForBusiness(businessId)
    : { accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null };
  const accessToken = credentials.accessToken;

  if (!accessToken) {
    return null;
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  };

  if (!body.url) {
    return null;
  }

  return body;
}

export async function downloadWhatsAppMedia(params: DownloadMediaParams) {
  const credentials = await getWhatsAppCredentialsForBusiness(params.businessId);
  const accessToken = credentials.accessToken;

  if (!accessToken) {
    return {
      downloaded: false,
      reason: "whatsapp_access_token_missing",
    };
  }

  const media = await getWhatsAppMediaDownloadUrl(params.mediaId, params.businessId);

  if (!media?.url) {
    return {
      downloaded: false,
      reason: "media_url_unavailable",
    };
  }

  const response = await fetch(media.url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return {
      downloaded: false,
      reason: "media_download_failed",
      status: response.status,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const extension = extensionFromMimeType(media.mime_type);
  const directory = join(process.cwd(), "storage", "receipts", params.businessId);
  const filename = `${params.mediaId}.${extension}`;
  const storagePath = join(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(storagePath, buffer);

  return {
    downloaded: true,
    storagePath,
    mimeType: media.mime_type,
    fileSize: media.file_size ?? buffer.byteLength,
  };
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function extensionFromMimeType(mimeType?: string) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}
