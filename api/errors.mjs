// Ошибка API с кодом из контракта: out_of_area, bad_params, llm_failed, internal, network.
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}
