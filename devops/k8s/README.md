# Kubernetes Autoscaling (HPA)

Manifests for running the RemitMortgage backend API on Kubernetes with CPU-based
horizontal pod autoscaling.

| File | Purpose |
| --- | --- |
| `backend-deployment.yaml` | Backend Deployment with CPU/memory requests and limits |
| `backend-service.yaml` | ClusterIP Service fronting the backend pods |
| `backend-hpa.yaml` | HorizontalPodAutoscaler: 2–10 replicas, scale at 80% CPU |
| `loadtest-job.yaml` | Job that generates mock request load to verify scale-up |

## Prerequisites

The HPA reads pod CPU from the metrics API, so `metrics-server` must be running:

```bash
kubectl get deployment metrics-server -n kube-system
# if missing:
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

CPU **requests** are required on the Deployment — utilization is a percentage of
the request, and an HPA targeting a pod without one reports `<unknown>`.

## Deploy

```bash
kubectl apply -f devops/k8s/backend-deployment.yaml
kubectl apply -f devops/k8s/backend-service.yaml
kubectl apply -f devops/k8s/backend-hpa.yaml
```

## Policy

- **Target**: 80% average CPU utilization (secondary: 85% memory)
- **Replicas**: min 2, max 10
- **Scale up**: 30s stabilization, up to +100% or +4 pods per 30s
- **Scale down**: 300s stabilization, at most 1 pod per 60s

The asymmetric stabilization windows mean traffic spikes are absorbed quickly
while capacity is released slowly, avoiding replica thrash on bursty load.

## Verify autoscaling

Watch the HPA in one terminal:

```bash
kubectl get hpa remitmortgage-backend --watch
```

Generate load in another:

```bash
kubectl apply -f devops/k8s/loadtest-job.yaml
```

Expected: `TARGETS` climbs past `80%/80%` and `REPLICAS` grows toward 10.
Confirm the new pods:

```bash
kubectl get pods -l app=remitmortgage-backend
kubectl describe hpa remitmortgage-backend   # shows SuccessfulRescale events
```

Then remove the load and confirm scale-down:

```bash
kubectl delete job backend-loadtest
```

Replicas return to `minReplicas: 2` after the 300s scale-down stabilization
window, one pod per minute.
