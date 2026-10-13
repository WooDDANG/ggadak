import { ApiHttpError } from './transport';
export async function reviewWithConflictReload<T>(
  submit: () => Promise<T>,
  reload: () => Promise<void>,
): Promise<T> {
  try {
    return await submit();
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 409) {
      await reload();
      throw new Error('다른 검토자의 변경을 불러왔습니다. 내용과 작업 처리를 다시 검토해 주세요.');
    }
    throw error;
  }
}
