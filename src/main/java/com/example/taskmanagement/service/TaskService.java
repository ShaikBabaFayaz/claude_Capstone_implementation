package com.example.taskmanagement.service;

import com.example.taskmanagement.domain.Task;
import com.example.taskmanagement.domain.TaskStatus;
import com.example.taskmanagement.dto.PageResponse;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskPatchRequest;
import com.example.taskmanagement.dto.TaskReplaceRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.repository.TaskRepository;
import java.util.Objects;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {

    private final TaskRepository taskRepository;

    public TaskService(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    @Transactional
    public TaskResponse create(TaskCreateRequest request) {
        Task task = new Task();
        task.setTitle(request.getTitle());
        task.setDescription(request.getDescription());
        Optional<TaskStatus> status = request.getStatus();
        task.setStatus(status != null && status.isPresent() ? status.get() : TaskStatus.TODO);
        return TaskResponse.from(taskRepository.saveAndFlush(task));
    }

    @Transactional(readOnly = true)
    public TaskResponse get(Long id) {
        return TaskResponse.from(find(id));
    }

    @Transactional(readOnly = true)
    public PageResponse<TaskResponse> list(int page, int size) {
        Page<Task> result = taskRepository.findAll(PageRequest.of(page, size, Sort.by("id").ascending()));
        return new PageResponse<>(
                result.getContent().stream().map(TaskResponse::from).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages());
    }

    @Transactional
    public TaskResponse replace(Long id, TaskReplaceRequest request) {
        Task task = find(id);

        boolean changed = false;
        changed |= !Objects.equals(task.getTitle(), request.getTitle());
        changed |= !Objects.equals(task.getDescription(), request.getDescription());
        changed |= task.getStatus() != request.getStatus();

        if (!changed) {
            return TaskResponse.from(task);
        }

        task.setTitle(request.getTitle());
        task.setDescription(request.getDescription());
        task.setStatus(request.getStatus());
        return TaskResponse.from(taskRepository.saveAndFlush(task));
    }

    @Transactional
    public TaskResponse patch(Long id, TaskPatchRequest request) {
        // null reference = property absent; Optional.empty() = explicit JSON null.
        if (request.getTitle() == null && request.getDescription() == null && request.getStatus() == null) {
            throw new EmptyPatchException();
        }

        Task task = find(id);
        boolean changed = false;

        if (request.getTitle() != null) {
            String newTitle = request.getTitle().orElseThrow(() -> new InvalidPatchException("title"));
            if (!Objects.equals(task.getTitle(), newTitle)) {
                task.setTitle(newTitle);
                changed = true;
            }
        }

        if (request.getDescription() != null) {
            String newDescription = request.getDescription().orElse(null);
            if (!Objects.equals(task.getDescription(), newDescription)) {
                task.setDescription(newDescription);
                changed = true;
            }
        }

        if (request.getStatus() != null) {
            TaskStatus newStatus = request.getStatus().orElseThrow(() -> new InvalidPatchException("status"));
            if (task.getStatus() != newStatus) {
                task.setStatus(newStatus);
                changed = true;
            }
        }

        if (!changed) {
            return TaskResponse.from(task);
        }

        return TaskResponse.from(taskRepository.saveAndFlush(task));
    }

    @Transactional
    public void delete(Long id) {
        taskRepository.delete(find(id));
    }

    private Task find(Long id) {
        return taskRepository.findById(id).orElseThrow(() -> new TaskNotFoundException(id));
    }
}
