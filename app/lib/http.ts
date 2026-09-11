import { NextResponse } from 'next/server';
import { InputError } from './security';
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Lỗi không xác định.'; }
export function apiError(error: unknown) {
  return NextResponse.json({ error: errorMessage(error), message: errorMessage(error), success: false, status: 'error' }, { status: error instanceof InputError ? error.status : 500 });
}
