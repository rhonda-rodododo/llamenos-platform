@backend
Feature: Durable Object Routing
  As the DO router
  I want to dispatch requests to the correct handler
  So that each endpoint is served by the right method

  Scenario: GET request matches static route
    Given a route "GET /api/volunteers" is registered
    When a GET request to "/api/volunteers" arrives
    Then it should dispatch to the registered handler

  Scenario: POST request with path parameter
    Given a route "POST /api/volunteers/:id/role" is registered
    When a POST request to "/api/volunteers/abc123/role" arrives
    Then it should extract "abc123" as the id parameter

  Scenario: Unmatched path returns 404
    When a GET request to "/api/nonexistent" arrives
    Then the router should return 404

  Scenario: Wrong method returns 405
    Given a route "GET /api/settings" is registered
    When a DELETE request to "/api/settings" arrives
    Then the router should return 405

  Scenario: Multiple methods on same path
    Given routes for GET, POST, and DELETE on "/api/notes"
    Then each method dispatches to its own handler

  Scenario: Path parameters are decoded correctly
    Given a route with ":hubId" parameter
    When the URL contains URL-encoded characters
    Then the parameter value should be decoded
