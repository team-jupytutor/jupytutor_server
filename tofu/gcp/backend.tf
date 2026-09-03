terraform {
  backend "gcs" {
    bucket = "cs61a-140900-tofu-state"
    prefix = "jupytutor"
  }
}
