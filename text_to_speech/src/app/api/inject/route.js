import { injectText } from '@/utils/capcut';

export async function POST(request) {
  try {
    const { projectId, text, splitOption } = await request.json();

    if (!projectId) {
      return Response.json(
        { success: false, error: 'Thiếu projectId.' },
        { status: 400 }
      );
    }
    if (!text) {
      return Response.json(
        { success: false, error: 'Thiếu nội dung văn bản (text).' },
        { status: 400 }
      );
    }

    const result = injectText(projectId, text, splitOption || 'paragraph');
    return Response.json(result);
  } catch (error) {
    console.error('Error in API /api/inject:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
