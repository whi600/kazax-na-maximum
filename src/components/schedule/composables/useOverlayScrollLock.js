const createInitialScrollState = () => ({
  htmlOverflow: '',
  bodyOverflow: '',
  bodyTouchAction: '',
  htmlOverscrollBehavior: '',
  bodyOverscrollBehavior: '',
})

export const useOverlayScrollLock = () => {
  const scrollState = createInitialScrollState()

  const lockPageScroll = () => {
    if (typeof document === 'undefined') return
    const { documentElement, body } = document

    if (!scrollState.htmlOverflow) scrollState.htmlOverflow = documentElement.style.overflow
    if (!scrollState.bodyOverflow) scrollState.bodyOverflow = body.style.overflow
    if (!scrollState.bodyTouchAction) scrollState.bodyTouchAction = body.style.touchAction
    if (!scrollState.htmlOverscrollBehavior) {
      scrollState.htmlOverscrollBehavior = documentElement.style.overscrollBehavior
    }
    if (!scrollState.bodyOverscrollBehavior) {
      scrollState.bodyOverscrollBehavior = body.style.overscrollBehavior
    }

    documentElement.style.overflow = 'hidden'
    documentElement.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    body.style.touchAction = 'none'
  }

  const unlockPageScroll = () => {
    if (typeof document === 'undefined') return
    const { documentElement, body } = document

    documentElement.style.overflow = scrollState.htmlOverflow
    documentElement.style.overscrollBehavior = scrollState.htmlOverscrollBehavior
    body.style.overflow = scrollState.bodyOverflow
    body.style.overscrollBehavior = scrollState.bodyOverscrollBehavior
    body.style.touchAction = scrollState.bodyTouchAction
  }

  return {
    lockPageScroll,
    unlockPageScroll,
  }
}
