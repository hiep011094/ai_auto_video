import { listProjects } from '@/utils/capcut';

export async function GET() {
  try {
    const projects = listProjects();
    return Response.json({ success: true, projects });
  } catch (error) {
    console.error('Error in API /api/drafts:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
