/**
 * Makes sure every shader program the renderer has built is really finished.
 *
 * `compileAsync` (ShaderWarmup, Roll) only waits for the driver where the
 * KHR_parallel_shader_compile extension exists. Many weak GPUs don't have it: there it
 * resolves at once, and each program is actually linked the first time it's drawn,
 * stalling that frame - the moment the fire bursts off the paddle, the crater opens...
 * Asking each program for its uniforms and attributes forces that wait now, while
 * nothing is moving. Free for programs that are already done.
 *
 * @param {import('three').WebGLRenderer} gl
 */
export function linkPrograms(gl) {
  for (const program of gl.info.programs ?? []) {
    try {
      program.getUniforms()
      program.getAttributes()
    } catch {
      // A program that failed to compile has already said so; nothing to wait for.
    }
  }
}
