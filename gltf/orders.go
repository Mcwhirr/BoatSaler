package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const (
	salesOrderStatusNew       = "new"
	salesOrderStatusFollowing = "following"
	salesOrderStatusCompleted = "completed"
)

var salesOrderStatuses = []string{
	salesOrderStatusNew,
	salesOrderStatusFollowing,
	salesOrderStatusCompleted,
}

type salesOrderStore struct {
	UpdatedAt string       `json:"updatedAt"`
	Orders    []salesOrder `json:"orders"`
}

type salesOrder struct {
	ID                    string   `json:"id"`
	CreatedAt             string   `json:"createdAt"`
	UpdatedAt             string   `json:"updatedAt"`
	Status                string   `json:"status"`
	ModelID               string   `json:"modelId"`
	ModelLabel            string   `json:"modelLabel"`
	CustomerName          string   `json:"customerName"`
	CustomerContact       string   `json:"customerContact"`
	Category              string   `json:"category"`
	AppearanceLabel       string   `json:"appearanceLabel"`
	ColorLabel            string   `json:"colorLabel"`
	ColorHex              string   `json:"colorHex"`
	InteriorLabel         string   `json:"interiorLabel"`
	PowerLabel            string   `json:"powerLabel"`
	OptionalPackageLabels []string `json:"optionalPackageLabels"`
	TotalPrice            int      `json:"totalPrice"`
	Source                string   `json:"source"`
}

type salesOrderCreateInput struct {
	ModelID               string   `json:"modelId"`
	ModelLabel            string   `json:"modelLabel"`
	CustomerName          string   `json:"customerName"`
	CustomerContact       string   `json:"customerContact"`
	Category              string   `json:"category"`
	AppearanceLabel       string   `json:"appearanceLabel"`
	ColorLabel            string   `json:"colorLabel"`
	ColorHex              string   `json:"colorHex"`
	InteriorLabel         string   `json:"interiorLabel"`
	PowerLabel            string   `json:"powerLabel"`
	OptionalPackageLabels []string `json:"optionalPackageLabels"`
	TotalPrice            int      `json:"totalPrice"`
	Source                string   `json:"source"`
}

type salesOrderStatusInput struct {
	Status string `json:"status"`
}

type adminSalesStateResponse struct {
	UpdatedAt     string       `json:"updatedAt"`
	NewOrderCount int          `json:"newOrderCount"`
	Orders        []salesOrder `json:"orders"`
}

type salesOrderActionResponse struct {
	Message string     `json:"message"`
	Order   salesOrder `json:"order"`
}

func (a *app) registerOrderRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/orders", a.handleCreateSalesOrder)
	mux.HandleFunc("GET /api/admin/orders", a.requireAdminSession(a.handleAdminSalesOrders))
	mux.HandleFunc("PUT /api/admin/orders/{orderID}/status", a.requireAdminSession(a.handleAdminUpdateSalesOrderStatus))
}

func (a *app) handleCreateSalesOrder(w http.ResponseWriter, r *http.Request) {
	var input salesOrderCreateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeAPIError(w, http.StatusBadRequest, fmt.Errorf("decode sales order input: %w", err))
		return
	}

	order, err := buildSalesOrder(input)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	store, err := a.readSalesOrderStore()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	store.Orders = append([]salesOrder{order}, store.Orders...)
	if err := a.writeSalesOrderStore(store); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, salesOrderActionResponse{
		Message: "Sales order created",
		Order:   order,
	})
}

func (a *app) handleAdminSalesOrders(w http.ResponseWriter, r *http.Request) {
	state, err := a.buildAdminSalesState()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, state)
}

func (a *app) handleAdminUpdateSalesOrderStatus(w http.ResponseWriter, r *http.Request) {
	orderID := strings.TrimSpace(r.PathValue("orderID"))
	if orderID == "" {
		writeAPIError(w, http.StatusBadRequest, errors.New("orderID is required"))
		return
	}

	var input salesOrderStatusInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeAPIError(w, http.StatusBadRequest, fmt.Errorf("decode sales order status input: %w", err))
		return
	}

	nextStatus, err := normalizeSalesOrderStatus(input.Status)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	store, err := a.readSalesOrderStore()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	index := -1
	for idx := range store.Orders {
		if store.Orders[idx].ID == orderID {
			index = idx
			break
		}
	}

	if index == -1 {
		writeAPIError(w, http.StatusNotFound, fmt.Errorf("sales order %s does not exist", orderID))
		return
	}

	store.Orders[index].Status = nextStatus
	store.Orders[index].UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := a.writeSalesOrderStore(store); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, salesOrderActionResponse{
		Message: fmt.Sprintf("Updated sales order %s", orderID),
		Order:   store.Orders[index],
	})
}

func buildSalesOrder(input salesOrderCreateInput) (salesOrder, error) {
	modelID := strings.TrimSpace(input.ModelID)
	modelLabel := strings.TrimSpace(input.ModelLabel)
	if modelID == "" && modelLabel == "" {
		return salesOrder{}, errors.New("modelId or modelLabel is required")
	}

	if modelLabel == "" {
		modelLabel = modelID
	}

	customerName := strings.TrimSpace(input.CustomerName)
	customerContact := strings.TrimSpace(input.CustomerContact)
	if customerName == "" {
		return salesOrder{}, errors.New("customerName is required")
	}
	if customerContact == "" {
		return salesOrder{}, errors.New("customerContact is required")
	}

	orderID, err := generateSalesOrderID()
	if err != nil {
		return salesOrder{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339)

	return salesOrder{
		ID:                    orderID,
		CreatedAt:             now,
		UpdatedAt:             now,
		Status:                salesOrderStatusNew,
		ModelID:               modelID,
		ModelLabel:            modelLabel,
		CustomerName:          customerName,
		CustomerContact:       customerContact,
		Category:              strings.TrimSpace(input.Category),
		AppearanceLabel:       strings.TrimSpace(input.AppearanceLabel),
		ColorLabel:            strings.TrimSpace(input.ColorLabel),
		ColorHex:              strings.TrimSpace(input.ColorHex),
		InteriorLabel:         strings.TrimSpace(input.InteriorLabel),
		PowerLabel:            strings.TrimSpace(input.PowerLabel),
		OptionalPackageLabels: normalizeStringList(input.OptionalPackageLabels),
		TotalPrice:            max(0, input.TotalPrice),
		Source:                normalizeSalesOrderSource(input.Source),
	}, nil
}

func generateSalesOrderID() (string, error) {
	randomBytes := make([]byte, 4)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generate sales order id: %w", err)
	}

	return fmt.Sprintf("SO-%s-%s", time.Now().UTC().Format("20060102-150405"), strings.ToUpper(hex.EncodeToString(randomBytes))), nil
}

func normalizeSalesOrderSource(source string) string {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" {
		return "showcase-web"
	}

	return trimmed
}

func normalizeStringList(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}

	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}

		result = append(result, trimmed)
	}

	return result
}

func normalizeSalesOrderStatus(status string) (string, error) {
	trimmed := strings.TrimSpace(status)
	if !slices.Contains(salesOrderStatuses, trimmed) {
		return "", fmt.Errorf("unsupported sales order status %q", status)
	}

	return trimmed, nil
}

func defaultSalesOrderStore() salesOrderStore {
	return salesOrderStore{
		Orders: []salesOrder{},
	}
}

func (a *app) buildAdminSalesState() (adminSalesStateResponse, error) {
	store, err := a.readSalesOrderStore()
	if err != nil {
		return adminSalesStateResponse{}, err
	}

	return adminSalesStateResponse{
		UpdatedAt:     store.UpdatedAt,
		NewOrderCount: countNewSalesOrders(store.Orders),
		Orders:        store.Orders,
	}, nil
}

func countNewSalesOrders(orders []salesOrder) int {
	count := 0
	for _, order := range orders {
		if order.Status == salesOrderStatusNew {
			count += 1
		}
	}

	return count
}

func (a *app) readSalesOrderStore() (salesOrderStore, error) {
	data, err := os.ReadFile(a.ordersPath)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultSalesOrderStore(), nil
		}

		return salesOrderStore{}, fmt.Errorf("read sales orders: %w", err)
	}

	var store salesOrderStore
	if err := json.Unmarshal(data, &store); err != nil {
		return salesOrderStore{}, fmt.Errorf("parse sales orders: %w", err)
	}

	if store.Orders == nil {
		store.Orders = []salesOrder{}
	}

	return store, nil
}

func (a *app) writeSalesOrderStore(store salesOrderStore) error {
	if store.Orders == nil {
		store.Orders = []salesOrder{}
	}

	store.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := os.MkdirAll(filepath.Dir(a.ordersPath), 0o755); err != nil {
		return fmt.Errorf("create sales order directory: %w", err)
	}

	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal sales orders: %w", err)
	}

	if err := os.WriteFile(a.ordersPath, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write sales orders: %w", err)
	}

	return nil
}
