/*
 * React cannot intercept an Enter submit until the client bundle hydrates.
 * Prevent browser navigation for client-owned forms during that narrow window;
 * React receives the event after hydration and runs the normal submit handler.
 */
(function preventUnhydratedClientFormSubmission() {
  document.addEventListener(
    "submit",
    function preventClientFormNavigation(event) {
      var form = event.target;
      if (form instanceof HTMLFormElement && form.dataset.dgClientForm === "true") {
        event.preventDefault();
      }
    },
    true,
  );
})();
