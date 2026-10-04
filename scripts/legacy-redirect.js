// Keep previously shared Workers URLs useful after moving to Pages.
export default {
  fetch(request) {
    const url = new URL(request.url);
    const destination = new URL("https://puyopuyo-72q.pages.dev");
    destination.pathname = url.pathname;
    destination.search = url.search;
    return Response.redirect(destination.href, 302);
  },
};
