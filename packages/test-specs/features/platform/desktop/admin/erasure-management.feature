@desktop
Feature: Admin Erasure Management
  As an admin
  I want to manage GDPR erasure requests and remote wipe devices
  So that I can fulfil compliance obligations

  Background:
    Given I am logged in as an admin

  Scenario: Erasure queue section renders in admin panel
    When I navigate to the admin "erasure-queue" section
    Then I should see the erasure queue or empty state

  Scenario: Erasure config section renders in admin panel
    When I navigate to the admin "erasure-config" section
    Then I should see the erasure config form

  Scenario: Erasure queue shows admin erase and remote wipe buttons
    When I navigate to the admin "erasure-queue" section
    Then I should see the admin erase button
    And I should see the admin wipe button

  Scenario: Admin erase dialog opens on button click
    When I navigate to the admin "erasure-queue" section
    And I click the admin erase button
    Then I should see a dialog for entering user ID and justification

  Scenario: Admin wipe dialog opens on button click
    When I navigate to the admin "erasure-queue" section
    And I click the admin wipe button
    Then I should see a dialog for entering user ID and device pubkey
